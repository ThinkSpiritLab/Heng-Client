import { getLogger } from "log4js";
import { createHmac, randomInt, createHash } from "crypto";
import Axios, { AxiosResponse, AxiosRequestConfig } from "axios";
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
import { EncryptParam, Sign } from "heng-sign-js";
import { stat } from "./Utilities/Statistics";
import moment from "moment";
import https from "https";

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
    sign = new Sign((param: EncryptParam) => {
        if (param.algorithm === "SHA256") {
            return createHash("sha256").update(param.data).digest("hex");
        } else if (param.algorithm === "HmacSHA256") {
            if (!param.key) {
                throw new Error("no key provided");
            }
            return createHmac("sha256", param.key)
                .update(param.data)
                .digest("hex");
        }
        return "";
    }, true);
    get nonce(): number {
        return this._nonce++;
    }
    logger = getLogger("Controller");
    exitTimer: NodeJS.Timeout | undefined = undefined;
    httpsAgent = new https.Agent({
        rejectUnauthorized: false,
    });
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
        const fn = async () => {
            this.do("ReportStatus", {
                collectTime: moment().format("YYYY-MM-DDTHH:mm:ssZ"),
                nextReportTime: moment(Date.now() + interval).format(
                    "YYYY-MM-DDTHH:mm:ssZ"
                ),
                report: stat.collect(),
            });
        };
        this.statusReportTimer = setInterval(fn, interval);
        fn();
    }
    stopReport(): void {
        if (this.statusReportTimer !== undefined) {
            clearInterval(this.statusReportTimer);
            this.statusReportTimer = undefined;
        }
    }
    async exec(req: AxiosRequestConfig): Promise<AxiosResponse<unknown>> {
        req.httpsAgent = this.httpsAgent;
        return (await Axios.request(req)) as AxiosResponse<unknown>;
    }

    async getToken(
        maxTaskCount: number,
        coreCount?: number,
        name?: string,
        software?: string
    ): Promise<AcquireTokenOutput> {
        const req = this.sign.sign({
            data: {
                maxTaskCount,
                coreCount,
                name,
                software,
            },
            params: {},
            url: `${this.host}/v1/judger/token`,
            method: "post",
            ak: this.AccessKey,
            sk: this.SecrectKey,
        });
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
    on(
        method: JudgerMethod,
        cb:
            | ((args: CreateJudgeArgs) => Promise<null>)
            | ((args: ExitArgs) => Promise<null>)
            | ((args: ControlArgs) => Promise<ConnectionSettings>)
            | ((args: void) => Promise<StatusReport>)
    ): Controller {
        this.judgerMethods.set(
            method,
            cb as (args: unknown) => Promise<unknown>
        );
        this.logger.info(`Method ${method} Registered`);
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
                }, 5000),
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
            throw new Error(
                `Method ${msg.body.method} doesn't exist or not inited.`
            );
        }
    }

    async connectWs(token: string): Promise<Controller> {
        return new Promise((resolve) => {
            this.ws = new WebSocket(
                `${this.host}/v1/judger/websocket?token=${token}`,
                {
                    agent: this.host.startsWith("https")
                        ? this.httpsAgent
                        : undefined,
                }
            );
            this.ws.on("open", () => {
                this.logger.info("Ws Opened");
                this.startReport(this.connectingSettings.statusReportInterval);
                resolve(this);
            });
            this.ws.on("close", () => {
                this.logger.fatal("Ws Closed");
                this.stopReport();
                if (this.exitTimer === undefined) {
                    setTimeout(() => {
                        process.exit(3);
                    }, 2000);
                }
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
                                    error: { code: 500, message: String(e) },
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
