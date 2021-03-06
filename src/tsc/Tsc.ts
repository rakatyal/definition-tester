'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as Promise from 'bluebird';
import * as findup from 'findup-sync';

import * as exec from '../util/exec';
import * as util from '../util/util';

import * as ts from 'typescript';

import {ITscExecOptions} from './ITscExecOptions';

let lastOpts: ts.CompilerOptions = {};
let lastProgram: ts.Program = undefined;

function diagsToStrings(diags: ts.Diagnostic[]): string[] {
	return diags.map(d => {
		const pos = ts.getLineAndCharacterOfPosition(d.file, d.start);
		return `${d.file.fileName.replace(/\//g, '\\')}\n\t Line ${pos.line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, '\r\n')}`;
	});
}

export default class Tsc {
	static useJsx = /\.tsx$/i;

	public static run(tsConfigfile: string, options: ITscExecOptions): Promise<string[]> {
		let tscPath = options.tscPath;

		return Promise.all([
			util.fileExists(tsConfigfile),
			util.fileExists(tscPath)
		]).spread((tsfileExists: boolean, tscPathExists: boolean) => {
			if (!tsfileExists) {
				throw new Error(tsConfigfile + ' does not exist');
			}
			if (!tscPathExists) {
				throw new Error(tscPath + ' does not exist');
			}
			return true;
		}).then(ok => {
			const root = path.dirname(tsConfigfile);

            const configJson = ts.parseConfigFileTextToJson('tsconfig.json', fs.readFileSync(tsConfigfile, 'utf-8'));
			const configParse = ts.parseJsonConfigFileContent(configJson.config, ts.sys, root, undefined, tsConfigfile);
			const opts = configParse.options;

			if (opts === undefined) {
				throw new Error('Failed when parsing ' + tsConfigfile);
			}

			const oldCwd = process.cwd();
			let diagnostics: ts.Diagnostic[] = [];

			lastProgram = ts.createProgram(configParse.fileNames, opts);

			lastOpts = opts;
			const program = lastProgram;

			program.getSourceFiles().forEach(src => {
				if (!path.basename(src.fileName).startsWith('lib.')) {
					const sem = program.getSemanticDiagnostics(src);
					if (sem) diagnostics = diagnostics.concat(sem);
					const syn = program.getSyntacticDiagnostics(src);
					if (syn) diagnostics = diagnostics.concat(syn);
				}
			});

			const result = diagsToStrings(diagnostics);
			if(result.length > 0) {
				console.log(result.join('\r\n'));
			}
			return result;
		});
	}
}
