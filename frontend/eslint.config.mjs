import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";
import globals from "globals";
import svelteConfig from "./svelte.config.js";
import stylistic from "@stylistic/eslint-plugin"
import tseslint from "typescript-eslint";

export default defineConfig([
    js.configs.recommended,
    tseslint.configs.recommended,
    svelte.configs.recommended,
    {
        plugins: {
            "@stylistic": stylistic
        },
        languageOptions: { globals: { ...globals.browser, ...globals.node } }
    },
    {
        files: ["**/*.svelte", "**/*.svelte.js"],
        languageOptions: {
            parserOptions: {
                tsconfigRootDir: import.meta.dirname,
                projectService: true,
                // Enable typescript parsing for `.svelte` files.
                extraFileExtensions: [".svelte"],
                parser: tseslint.parser,
                svelteConfig,
            }
        }
    },
    {
        // Override or add rule settings here, such as:
        // 'svelte/button-has-type': 'error'
        rules: {
            "@stylistic/indent": ["error", 4],
            "@stylistic/quotes": ["error", "double"],
        }
    }
]);
