import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import stylistic from "@stylistic/eslint-plugin"
import globals from 'globals';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig([
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	{
	  	plugins: {
            "@stylistic": stylistic
        },
		files: ['**/*.{js,ts}'],
		languageOptions: { globals: { ...globals.browser, ...globals.node } }
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
