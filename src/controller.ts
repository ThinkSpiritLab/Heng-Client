import { getLogger } from "log4js";
import * as crypto from "crypto";
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
    JudgerArgs,
    LogArgs,
    ControllerArgs,
    ReportStatusArgs,
    FinishJudgesArgs,
    UpdateJudgesArgs,
} from "heng-protocol/internal-protocol/ws";
import { AcquireTokenOutput } from "heng-protocol/internal-protocol/http";
import * as WebSocket from "ws";
import { ConnectionSettings, ErrorInfo } from "heng-protocol/internal-protocol";
class Param {
    key: string;
    val: string;
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

export class ControllerConfig {
    host: string;
    SecrectKey: string;
    AccessKey: string;
}

export class Controller {
    host: string;
    SecrectKey: string;
    AccessKey: string;
    ws: WebSocket;
    judgerMethods: Map<JudgerMethod, (unknown) => Promise<unknown>>;
    messageCallbackMap: Map<
        number,
        {
            resolve: (unkown) => void;
            reject: (any) => void;
            timer: NodeJS.Timeout;
        }
    >;
    static MaxNonce = 0xffff;
    _nonce = crypto.randomInt(Controller.MaxNonce);
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
    }
    sign(req: Req): void {
        let params: Param[] = [];
        let headers: Header[] = [];
        for (const key in req.params) {
            params.push({ key, val: req.params[key].toString() });
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
        const signature = crypto
            .createHmac("sha256", this.SecrectKey)
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
            method: "get",
        } as Req;
        this.sign(req);
        try {
            const res = (await this.exec(req)).data;
            return res as AcquireTokenOutput;
        } catch (error) {
            this.logger.fatal(error);
        }
    }

    on(
        method: "CreateJudge",
        cb: (args: CreateJudgeArgs) => Promise<void>
    ): Controller;
    on(method: "Exit", cb: (args: ExitArgs) => Promise<void>): Controller;
    on(
        method: "Control",
        cb: (args: ControlArgs) => Promise<ConnectionSettings>
    ): Controller;

    on(
        method: JudgerMethod,
        cb:
            | ((args: CreateJudgeArgs) => Promise<void>)
            | ((args: ExitArgs) => Promise<void>)
            | ((args: ControlArgs) => Promise<ConnectionSettings>)
    ): Controller {
        this.logger.info(`Method ${method} Registered`);
        this.judgerMethods.set(method, cb);
        return this;
    }

    async do(method: "Exit", args: ExitArgs): Promise<void>;
    async do(method: "Log", args: LogArgs): Promise<void>;
    async do(method: "ReportStatus", args: ReportStatusArgs): Promise<void>;
    async do(method: "UpdateJudges", args: UpdateJudgesArgs): Promise<void>;
    async do(method: "FinishJudges", args: FinishJudgesArgs): Promise<void>;

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
            this.ws.send(msg);
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
        if (this.judgerMethods.has(msg.body.method)) {
            return (await this.judgerMethods.get(msg.body.method))(
                msg.body.args
            );
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
                resolve(this);
            });
            this.ws.on("close", () => {
                this.logger.fatal("Ws Closed");
            });
            this.ws.on("message", async (msg) => {
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
            });
        });
    }
}
