import { getLogger } from "log4js";
import * as crypto from "crypto";
import { orderBy, toUpper } from "lodash";
import Axios, { AxiosResponse } from "axios";
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
    async exec(
        req: Req
    ): Promise<
        AxiosResponse<InternalProtocol.HTTPProtocolDefinition.HttpResponse>
    > {
        return (await Axios.request({
            url: `/v1${req.path}`,
            method: req.method,
            baseURL: this.host,
            data: req.body,
            params: req.params,
        })) as AxiosResponse<
            InternalProtocol.HTTPProtocolDefinition.HttpResponse
        >;
    }

    async getToken(
        maxTaskCount: number,
        coreCount?: number,
        name?: string,
        software?: string
    ): Promise<InternalProtocol.HTTPProtocolDefinition.AuthenticationResponse> {
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
            return res as InternalProtocol.HTTPProtocolDefinition.AuthenticationResponse;
        } catch (error) {
            this.logger.fatal(error);
        }
    }

    async connectWs(token: string): Promise<Controller> {
        this.ws = new WebSocket(
            `${this.host.replace("http", "ws")}/v1/judger/ws?token=${token}`
        );
        this.ws.on("open", () => {
            this.logger.info("Ws Opened");
        });
        return this;
    }
}
