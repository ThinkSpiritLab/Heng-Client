import { configure, getLogger } from "log4js";
import * as TOML from "@iarna/toml";
import * as fs from "fs";
import { plainToClass } from "class-transformer";
import { Controller, ControllerConfig } from "./controller";
import { cpus } from "os";
async function main() {
    configure({
        appenders: {
            cheese: { type: "file", filename: "cheese.log" },
            console: { type: "console" },
        },
        categories: {
            default: { appenders: ["cheese", "console"], level: "info" },
        },
    });
    const configToml = fs.readFileSync("config.toml").toString();
    const config = TOML.parse(configToml);
    const logger = getLogger("main");
    const controllerConfig = plainToClass(ControllerConfig, config.controller);
    const controller = new Controller(controllerConfig as ControllerConfig);
    const token = await controller.getToken(
        config.self["judgeCapability"],
        cpus().length,
        config.self["name"],
        config.self["version"]
    );
    logger.info(`Token is ${token}`);
    controller.connectWs(token.body.JWTToken);
    logger.info("Started");
}

main();
