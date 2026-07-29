/**
 * This file is part of the PimBay Asset Dedup service.
 *
 * @author Jan Sarmir <sarmir@pimbay.dev>
 * @link   https://pimbay.dev
 *
 * For the full license information, see the LICENSE file.
 */
import { createContainer, asClass, asValue, InjectionMode, type AwilixContainer } from 'awilix';
import pino from 'pino';
import type { Env } from './env/env.js';
import { createLoggerOptions } from './logger.js';
import { ImagehashRunner } from './hasher/imagehashRunner.js';
import { ImageHashService } from '../application/service/hash.service.js';

export interface Cradle {
  env: Env;
  logger: pino.Logger;

  imageHasher: ImagehashRunner;
  imageHashService: ImageHashService;
}

export interface BuiltContainer {
  container: AwilixContainer<Cradle>;
  cleanup: () => Promise<void>;
}

export function buildContainer(env: Env): BuiltContainer {
  const container = createContainer<Cradle>({ injectionMode: InjectionMode.CLASSIC });
  const logger = pino(createLoggerOptions(env));

  container.register({
    env: asValue(env),
    logger: asValue(logger),

    imageHasher: asClass(ImagehashRunner).singleton(),
    imageHashService: asClass(ImageHashService).singleton(),
  });

  return {
    container,
    cleanup: (): Promise<void> => Promise.resolve(),
  };
}
