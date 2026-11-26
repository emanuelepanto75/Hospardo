/* global __APP_VERSION__, __APP_DATE__ */
import { DateTime } from './time';

/** Versione di questa pagina (fissata quando l'interfaccia è stata compilata) */
export const APP_VERSION = __APP_VERSION__;
export const APP_DATE = __APP_DATE__;
export const versionLabel = () => `Versione ${APP_VERSION} · ${DateTime.fromISO(APP_DATE).toFormat('dd/LL/yyyy')}`;
