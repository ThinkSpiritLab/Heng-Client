import * as TOML from "@iarna/toml";
import { plainToClass, Type } from "class-transformer";
import {
    ArrayNotEmpty,
    ArrayUnique,
    IsBoolean,
    IsHexadecimal,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsPositive,
    IsString,
    Min,
    ValidateNested,
    validateSync,
} from "class-validator";
import fs from "fs";
import { getLogger } from "log4js";

const logger = getLogger("ConfigService");
const configToml = fs.readFileSync("config/config.toml").toString();
export class LanguageConfig {
    @IsString()
    @IsNotEmpty()
    cat!: string;
    @IsString()
    @IsNotEmpty()
    xst!: string;
    @IsString()
    @IsNotEmpty()
    ngdbuild!: string;
    @IsString()
    @IsNotEmpty()
    map!: string;
    @IsString()
    @IsNotEmpty()
    par!: string;
    @IsString()
    @IsNotEmpty()
    bitgen!: string;
    @IsString()
    @IsNotEmpty()
    impact!: string;
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
    @IsPositive()
    judgeCapability!: number;
    @IsString()
    @IsNotEmpty()
    name!: string;
    @IsString()
    @IsOptional()
    software?: string;
}
export class JudgeFactoryConfig {
    @IsBoolean()
    noSelfTestError!: boolean;
    @IsString()
    @IsNotEmpty()
    tmpdirBase!: string;
    @IsNumber()
    @IsPositive()
    timeRatioTolerance!: number;
    @IsInt()
    @IsPositive()
    defaultPidLimit!: number;
    @IsNumber()
    @IsPositive()
    defaultTimeRatio!: number;
    @IsInt()
    @Min(0)
    selfTestRound!: number;
    @IsInt()
    @Min(1000)
    uid!: number;
    @IsInt()
    @Min(1000)
    gid!: number;
    @IsBoolean()
    cacheUsr!: boolean;
    @IsBoolean()
    cacheSpj!: boolean;
    @IsBoolean()
    cacheInteractor!: boolean;
    @IsInt()
    @IsPositive()
    remoteFileCacheBytes!: number;
}
export class FpgaConfig {
    @ArrayNotEmpty()
    @ArrayUnique()
    @IsHexadecimal({
        each: true,
    })
    serial!: string[];
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
    @Type(() => JudgeFactoryConfig)
    judger!: JudgeFactoryConfig;
    @ValidateNested()
    @IsNotEmpty()
    @Type(() => FpgaConfig)
    fpga!: FpgaConfig;
    @IsNotEmpty()
    builtin!: Record<string, string>;
}
let config: Config | undefined = undefined;

function tryValidate(
    args: Record<string, unknown>,
    padding = 0,
    prefix = ""
): boolean {
    const errs = validateSync(args, {
        whitelist: true,
        forbidNonWhitelisted: true,
    });
    if (errs.length !== 0) {
        for (const err of errs) {
            logger.fatal(
                `${new String().padEnd(
                    padding,
                    "│ "
                )}│ Config check failed on property ${prefix}${err.property}`
            );
            if (err.constraints !== undefined) {
                for (const constrings in err.constraints) {
                    logger.fatal(
                        `${new String().padEnd(
                            padding,
                            "│ "
                        )}├ because ${constrings} failed(${
                            err.constraints[constrings]
                        })`
                    );
                }
            }
            if (err.value !== undefined) {
                logger.fatal(
                    `${new String().padEnd(
                        padding,
                        "│ "
                    )}├─┬${new String().padEnd(10, "─")}`
                );
                tryValidate(
                    err.value,
                    padding + 2,
                    `${prefix}${err.property}.`
                );
            }
            {
                logger.fatal(
                    `${new String().padEnd(
                        padding,
                        "│ "
                    )}└ No More details avaiable`
                );
                return false;
            }
        }
    }
    return true;
}

export function getConfig(): Config {
    if (config === undefined) {
        logger.info("Loading Config from file");
        const rawConfig = TOML.parse(configToml);
        config = plainToClass(Config, rawConfig);
        // logger.fatal(JSON.stringify(rawConfig));
        // logger.fatal(JSON.stringify(config));
        if (!tryValidate(config as unknown as Record<string, unknown>)) {
            config = undefined;
            throw new Error("Failed to get Config,Please check configToml");
        }
        logger.info("Loaded Config from file");
    }
    return config;
}

const builtin = new Map<string, string>();

export function getBuiltin() {
    if (builtin.size === 0) {
        for (const i in getConfig().builtin) {
            builtin.set(i, fs.readFileSync(getConfig().builtin[i], "utf-8"));
        }
    }
    return builtin;
}
