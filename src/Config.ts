import * as TOML from "@iarna/toml";
import { Type, plainToClass } from "class-transformer";
import {
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
    validateSync,
} from "class-validator";
import * as fs from "fs";
import { getLogger } from "log4js";
const logger = getLogger("ConfigService");
const configToml = fs.readFileSync("config.toml").toString();
export class LanguageConfig {
    @IsString()
    @IsNotEmpty()
    c!: string;
    @IsString()
    @IsNotEmpty()
    cpp!: string;
    @IsString()
    @IsNotEmpty()
    python!: string;
}
export class JailConfig {
    @IsString()
    @IsNotEmpty()
    path!: string;
    @IsString()
    @IsNotEmpty()
    configFile!: string;
}
class MeterConfig {
    @IsString()
    @IsNotEmpty()
    path!: string;
}
export class ControllerConfig {
    @IsString()
    @IsNotEmpty()
    host!: string;
    @IsString()
    @IsNotEmpty()
    SecrectKey!: string;
    @IsString()
    @IsNotEmpty()
    AccessKey!: string;
}
export class SelfConfig {
    @IsInt()
    @IsNotEmpty()
    judgeCapability!: number;
    @IsString()
    @IsNotEmpty()
    name!: string;
    @IsString()
    @IsNotEmpty()
    version!: string;
    @IsString()
    @IsOptional()
    software?: string;
}
export class Config {
    @ValidateNested()
    @IsNotEmpty()
    @Type(() => ControllerConfig)
    controller!: ControllerConfig;
    @ValidateNested()
    @IsNotEmpty()
    @Type(() => SelfConfig)
    self!: SelfConfig;
    @ValidateNested()
    @IsNotEmpty()
    @Type(() => LanguageConfig)
    language!: LanguageConfig;
    @ValidateNested()
    @IsNotEmpty()
    @Type(() => JailConfig)
    nsjail!: JailConfig;
    @ValidateNested()
    @IsNotEmpty()
    @Type(() => MeterConfig)
    hc!: MeterConfig;
}
let config: Config | undefined = undefined;
export function getConfig() {
    if (config === undefined) {
        logger.info("Loading Config from file");
        const rawConfig = TOML.parse(configToml);
        config = plainToClass(Config, rawConfig);
        const errs = validateSync(config);
        if (errs.length !== 0) {
            for (const err of errs) {
                logger.fatal(`Config check failed on property ${err.property}`);
                if (err.constraints !== undefined) {
                    for (const constrings in err.constraints) {
                        logger.fatal(
                            `because ${constrings} failed(${err.constraints[constrings]})`
                        );
                    }
                } else {
                    logger.fatal(`No details avaiable`);
                }
            }
            config = undefined;
            throw `Failed to get Config,Please check configToml`;
        }
        logger.info("Loaded Config from file");
    }
    return config;
}
