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
		return `${d.file.fileName.replace(/\//g, '\\')}:${pos.line} ${ts.flattenDiagnosticMessageText(d.messageText, '\r\n')}`;
	});
}

export default class Tsc {
	static useJsx = /\.tsx$/i;

	public static run(tsfile: string, options: ITscExecOptions): Promise<string[]> {
		let tscPath = options.tscPath;

		return Promise.all([
			util.fileExists(tsfile),
			util.fileExists(tscPath)
		]).spread((tsfileExists: boolean, tscPathExists: boolean) => {
			if (!tsfileExists) {
				throw new Error(tsfile + ' does not exist');
			}
			if (!tscPathExists) {
				throw new Error(tscPath + ' does not exist');
			}
			return true;
		}).then(ok => {
			const root = path.join(tsfile, '..');
			const jsonFilename = path.join(tsfile, '..', 'tsconfig.json');
			if (!fs.existsSync(jsonFilename)) {
				throw new Error(`${jsonFilename} does not exist`);
			}

            const configJson = ts.parseConfigFileTextToJson('tsconfig.json', fs.readFileSync(jsonFilename, 'utf-8'));
			const configParse = ts.parseJsonConfigFileContent(configJson.config, ts.sys, root, undefined);
			const opts = configParse.options;

			lastProgram = ts.createProgram(configParse.fileNames, opts);

			lastOpts = opts;
			const program = lastProgram;

			let diagnostics: ts.Diagnostic[] = [];
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
			} else {
				console.log(tsfile);
			}
			return result;
		});
	}
}
