import * as TOML from "@iarna/toml";
import * as fs from "fs";
const configToml = fs.readFileSync("config.toml").toString();
export const config = TOML.parse(configToml);