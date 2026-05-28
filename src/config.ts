import { ImmutableObject } from 'jimu-core';

export interface Config {
  wcsUrl: string;
  layerName: string;
  samplePoints: number;
}

export type IMConfig = ImmutableObject<Config>;
