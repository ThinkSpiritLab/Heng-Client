import { getLogger } from "log4js";
import { createHmac, randomInt } from "crypto";
import { orderBy, toUpper } from "lodash";
import Axios, { AxiosResponse } from "axios";
import {
    ControllerMethod,
    JudgerMethod,
    Message,
    Request,
    Response,
    CreateJudgeArgs,
    ExitArgs,
    ControlArgs,
    LogArgs,
    ControllerArgs,
    ReportStatusArgs,
    FinishJudgesArgs,
    UpdateJudgesArgs,
} from "heng-protocol/internal-protocol/ws";
import { AcquireTokenOutput } from "heng-protocol/internal-protocol/http";
import WebSocket from "ws";
import { ConnectionSettings, ErrorInfo } from "heng-protocol/internal-protocol";
import { ControllerConfig } from "./Config";
import { StatusReport } from "heng-protocol";
class Param {
    key!: string;
    val!: string;
    toString(): string {
        return `${this.key}=${this.val}`;
    }
}

type Header = Param;

type Req = {
    params: { [key: string]: string | number };
    headers: { [key: string]: string | number };
    body?: unknown;
    path: string;
    method: "put" | "post" | "get" | "delete";
};

export class Controller {
    host: string;
    SecrectKey: string;
    AccessKey: string;
    ws!: WebSocket;
    connectingSettings: ConnectionSettings = { statusReportInterval: 1000 };
    statusReportTimer?: NodeJS.Timer;
    judgerMethods: Map<
        JudgerMethod | "Report",
        (args: unknown) => Promise<unknown | void>
    >;
    messageCallbackMap: Map<
        number,
        {
            resolve: (arg0: unknown) => void;
            reject: (arg0: unknown) => void;
            timer: NodeJS.Timeout;
        }
    >;
    static MaxNonce = 0xffff;
    _nonce = randomInt(Controller.MaxNonce);
    get nonce(): number {
        return this._nonce++;
    }
    logger = getLogger("Controller");
    constructor(config: ControllerConfig) {
        this.host = config.host;
        this.SecrectKey = config.SecrectKey;
        this.AccessKey = config.AccessKey;
        this.judgerMethods = new Map();
        this.messageCallbackMap = new Map();
        this.on("Control", async (args) => {
            if (args !== null) {
                if (args.statusReportInterval !== undefined) {
                    this.connectingSettings.statusReportInterval =
                        args.statusReportInterval;
                    this.logger.info(
                        `报告间隔改为${args.statusReportInterval}ms`
                    );
                }
            }
            this.startReport(this.connectingSettings.statusReportInterval);
            return this.connectingSettings;
        });
    }
    startReport(interval: number): void {
        if (this.statusReportTimer !== undefined) {
            this.stopReport();
        }
        this.statusReportTimer = setInterval(async () => {
            const reportFunction = this.judgerMethods.get("Report");
            if (reportFunction !== undefined) {
                this.do("ReportStatus", {
                    collectTime: new Date().toISOString(),
                    nextReportTime: new Date(
                        new Date().valueOf() + interval
                    ).toISOString(),
                    report: (await reportFunction(undefined)) as StatusReport,
                });
            } else {
                this.logger.warn("找不到状态获取回调，无法报告状态。");
            }
        }, interval);
    }
    stopReport(): void {
        if (this.statusReportTimer !== undefined) {
            clearInterval(this.statusReportTimer);
            this.statusReportTimer = undefined;
        }
    }
    sign(req: Req): void {
        let params: Param[] = [];
        let headers: Header[] = [];
        for (const key in req.params) {
            params.push({ key, val: req.params[key].toString() });
        }
        if (req.headers === undefined) {
            req.headers = {};
        }
        req.headers["x-heng-nonce"] = this.nonce.toString();
        req.headers["x-heng-timestamp"] = Date.now().toString();
        req.headers["x-heng-accesskey"] = this.AccessKey;
        for (const key in req.headers) {
            if (key !== "x-heng-signature") {
                headers.push({ key, val: req.headers[key].toString() });
            }
        }
        if (req.body !== undefined) {
            params.push({
                key: "body",
                val:
                    typeof req.body === "string"
                        ? req.body
                        : JSON.stringify(req.body),
            });
        }
        params = orderBy(params, "key");
        headers = orderBy(headers, "key");
        const reqStr = `${toUpper(req.method)}:${headers
            .map((h) => h.toString())
            .join("&")}:${req.path}?${params
            .map((p) => p.toString())
            .join("&")}`;
        const signature = createHmac("sha256", this.SecrectKey)
            .update(reqStr)
            .digest("hex");
        if (!req.headers) {
            req.headers = {};
        }
        req.headers["x-heng-signature"] = signature;
    }
    async exec(req: Req): Promise<AxiosResponse<unknown>> {
        return (await Axios.request({
            url: `/v1${req.path}`,
            method: req.method,
            baseURL: this.host,
            data: req.body,
            params: req.params,
            headers: req.headers,
        })) as AxiosResponse<unknown>;
    }

    async getToken(
        maxTaskCount: number,
        coreCount?: number,
        name?: string,
        software?: string
    ): Promise<AcquireTokenOutput> {
        const req = {
            body: {
                maxTaskCount,
                coreCount,
                name,
                software,
            },
            params: {},
            path: "/judger/token",
            method: "post",
        } as Req;
        this.sign(req);
        try {
            const res = (await this.exec(req)).data;
            return res as AcquireTokenOutput;
        } catch (error) {
            this.logger.fatal(error);
            throw error;
        }
    }

    on(
        method: "CreateJudge",
        cb: (args: CreateJudgeArgs) => Promise<null>
    ): Controller;
    on(method: "Exit", cb: (args: ExitArgs) => Promise<null>): Controller;
    on(
        method: "Control",
        cb: (args: ControlArgs) => Promise<ConnectionSettings>
    ): Controller;
    on(method: "Report", cb: (args: void) => Promise<StatusReport>): Controller;
    on(
        method: JudgerMethod | "Report",
        cb:
            | ((args: CreateJudgeArgs) => Promise<null>)
            | ((args: ExitArgs) => Promise<null>)
            | ((args: ControlArgs) => Promise<ConnectionSettings>)
            | ((args: void) => Promise<StatusReport>)
    ): Controller {
        this.logger.info(`Method ${method} Registered`);
        this.judgerMethods.set(
            method,
            cb as (args: unknown) => Promise<unknown>
        );
        return this;
    }

    async do(method: "Exit", args: ExitArgs): Promise<null>;
    async do(method: "Log", args: LogArgs): Promise<null>;
    async do(method: "ReportStatus", args: ReportStatusArgs): Promise<null>;
    async do(method: "UpdateJudges", args: UpdateJudgesArgs): Promise<null>;
    async do(method: "FinishJudges", args: FinishJudgesArgs): Promise<null>;

    async do(method: ControllerMethod, args: ControllerArgs): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const nonce = this.nonce;
            this.messageCallbackMap.set(nonce, {
                resolve,
                reject,
                timer: setTimeout(() => {
                    this.messageCallbackMap.delete(nonce);
                    reject("Time out");
                }, 10000),
            });
            const msg = JSON.stringify({
                type: "req",
                seq: nonce,
                time: new Date().toISOString(),
                body: {
                    method,
                    args,
                },
            } as Request<ControllerMethod>);
            if (this.ws !== undefined) {
                this.ws.send(msg);
            }
        });
    }

    handleRes(msg: Response): void {
        const cb = this.messageCallbackMap.get(msg.seq);
        if (cb) {
            clearTimeout(cb.timer);
            this.messageCallbackMap.delete(msg.seq);
            const { output, error } = msg.body as {
                output: unknown;
                error: ErrorInfo;
            };
            if (error) {
                cb.reject(error);
            } else {
                cb.resolve(output);
            }
        } else {
            this.logger.info(
                `Res ${msg.seq} received but timeout or Never Send`
            );
        }
    }

    async handleReq(msg: Request<JudgerMethod>): Promise<unknown> {
        const method = this.judgerMethods.get(msg.body.method);
        if (method !== undefined) {
            return method(msg.body.args);
        } else {
            throw `Method ${msg.body.method} doesn't exist or not inited.`;
        }
    }

    async connectWs(token: string): Promise<Controller> {
        return new Promise((resolve) => {
            this.ws = new WebSocket(
                `${this.host}v1/judger/websocket?token=${token}`
            );
            this.ws.on("open", () => {
                this.logger.info("Ws Opened");
                this.startReport(this.connectingSettings.statusReportInterval);
                resolve(this);
            });
            this.ws.on("close", () => {
                this.logger.fatal("Ws Closed");
                this.stopReport();
            });
            this.ws.on("message", async (msg) => {
                if (typeof msg === "string") {
                    const message = JSON.parse(msg) as Message;
                    if (message.type === "req") {
                        try {
                            const res: Response = {
                                type: "res",
                                seq: message.seq,
                                time: new Date().toISOString(),
                                body: {
                                    output: await this.handleReq(
                                        message as Request<JudgerMethod>
                                    ),
                                },
                            };
                            this.ws.send(JSON.stringify(res));
                        } catch (e) {
                            const res: Response = {
                                type: "res",
                                seq: message.seq,
                                time: new Date().toISOString(),
                                body: {
                                    error: { code: 500, message: e.toString() },
                                },
                            };
                            this.ws.send(JSON.stringify(res));
                        }
                    } else if (message.type === "res") {
                        this.handleRes(message as Response);
                    }
                }
            });
        });
    }
}
