import js from "@eslint/js";
import ts, { configs } from "typescript-eslint";
import importX from "eslint-plugin-import-x";
import prettier from "eslint-plugin-prettier/recommended";
export default ts.config({
    extends: [
        js.configs.recommended,
        ...configs.recommendedTypeChecked,
        ...configs.stylisticTypeChecked,
        importX.flatConfigs.recommended,
        importX.flatConfigs.typescript,
        prettier,
    ],
    files: ["eslint.config.ts", "src/**/*.ts"],
    languageOptions: {
        parserOptions: {
            projectService: true,
            tsconfigRootDir: __dirname, // FIXME: CommonJS
        },
    },
    rules: {
        "no-unused-vars": "off",
        "@typescript-eslint/no-base-to-string": "off",
        "@typescript-eslint/no-misused-promises": [
            "warn",
            {
                checksVoidReturn: false,
            },
        ],
        "@typescript-eslint/no-unused-vars": ["warn"],
    },
});
