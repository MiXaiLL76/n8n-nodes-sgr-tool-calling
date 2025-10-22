/**
 * Logger wrapper with configurable log levels
 */
import type { Logger, LogMetadata } from 'n8n-workflow';

export type LogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
	none: 0,
	error: 1,
	warn: 2,
	info: 3,
	debug: 4,
};

export class ConfigurableLogger {
	private logger: Logger;
	private level: LogLevel;

	constructor(logger: Logger, level: LogLevel = 'error') {
		this.logger = logger;
		this.level = level;
	}

	setLevel(level: LogLevel): void {
		this.level = level;
	}

	getLevel(): LogLevel {
		return this.level;
	}

	private shouldLog(messageLevel: LogLevel): boolean {
		return LOG_LEVELS[messageLevel] <= LOG_LEVELS[this.level];
	}

	debug(message: string, metadata?: LogMetadata): void {
		if (this.shouldLog('debug')) {
			this.logger.debug(message, metadata);
		}
	}

	info(message: string, metadata?: LogMetadata): void {
		if (this.shouldLog('info')) {
			this.logger.info(message, metadata);
		}
	}

	warn(message: string, metadata?: LogMetadata): void {
		if (this.shouldLog('warn')) {
			this.logger.warn(message, metadata);
		}
	}

	error(message: string, metadata?: LogMetadata): void {
		if (this.shouldLog('error')) {
			this.logger.error(message, metadata);
		}
	}
}
