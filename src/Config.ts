import * as TOML from "@iarna/toml";
import { Type, plainToClass } from "class-transformer";
import {
    IsInt,
    IsNotEmpty,
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
    @IsNotEmpty()
    software!: string;
}
export class Config {
    @ValidateNested()
    @IsNotEmpty()
    @Type(() => ControllerConfig)
    controller!: ControllerConfig;
    @ValidateNested()
    @IsNotEmpty()
    self!: SelfConfig;
    @ValidateNested()
    @IsNotEmpty()
    language!: LanguageConfig;
    @ValidateNested()
    @IsNotEmpty()
    nsjail!: JailConfig;
    @ValidateNested()
    @IsNotEmpty()
    hc!: MeterConfig;
}
let config: Config | undefined = undefined;
export function getConfig() {
    if (config === undefined) {
        const rawConfig = TOML.parse(configToml);
        config = plainToClass(Config, rawConfig);
        const errs = validateSync(config);
        if (errs.length !== 0) {
            for (const err of errs) {
                logger.fatal(`Config check failed on property ${err.property}`);
            }
            config = undefined;
            throw `Failed to get Config,Please check configToml`;
        }
    }
    return config;
}
