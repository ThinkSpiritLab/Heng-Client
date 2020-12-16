import { getLogger } from "log4js";
import * as crypto from "crypto";
import { orderBy, toUpper } from "lodash";
import Axios from "axios";
import { InternalProtocol } from "heng-protocol";
import * as WebSocket from "ws";
class Param {
    key: string;
    val: string;
    toString(): string {
        return `${this.key}=${this.val}`;
    }
}

type Req = {
    params: { [key: string]: string | number };
    body?: any;
    path: string;
    method: "put" | "post" | "get" | "delete";
};

export class Controller {
    host: string;
    SecrectKey: string;
    AccessKey: string;
    ws: WebSocket;
    static MaxNonce = 0xffff;
    _nonce = crypto.randomInt(Controller.MaxNonce);
    get nonce() {
        return this._nonce++;
    }
    logger = getLogger("Controller");
    constructor(config: any) {
        if (config && config.host && config.SecrectKey && config.AccessKey) {
            this.host = config.host;
            this.SecrectKey = config.SecrectKey;
            this.AccessKey = config.AccessKey;
        } else {
            this.logger.fatal(`Controller Config is Broken`);
        }
    }
    sign(req: Req): void {
        let params: Param[] = [];
        for (const key in req.params) {
            params.push({ key, val: req.params[key].toString() });
        }
        params.push({ key: "nonce", val: this.nonce.toString() });
        params.push({ key: "timestamp", val: Date.now().toString() });
        params.push({ key: "AccessKey", val: this.AccessKey });
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
        const reqStr = `${toUpper(req.method)}:${req.path}?${params
            .map((p) => p.toString())
            .join("&")}`;
        const signature = crypto
            .createHmac("sha256", this.SecrectKey)
            .update(reqStr)
            .digest("hex");
        req.params.signature = signature;
    }
    exec(req: Req) {
        return Axios.request({
            url: `/v1${req.path}`,
            method: req.method,
            baseURL: this.host,
            data: req.body,
            params: req.params,
        });
    }

    async getToken(
        maxTaskCount: number,
        coreCount?: number,
        name?: string,
        software?: string
    ) {
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
            return (await this.exec(req)).data;
        } catch (error) {
            this.logger.fatal(error);
        }
    }

    async connectWs(token: string) {
        this.ws = new WebSocket(
            `${this.host.replace("http", "ws")}/v1/judger/ws?token=${token}`
        );
        this.ws.on("open", () => {
            this.logger.info("Ws Opened");
        });
    }
}
