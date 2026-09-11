import {createTeaApi} from './client';

const apiBase=(import.meta.env.VITE_API_BASE_URL as string|undefined)?.trim();
export const teaApi=apiBase?createTeaApi(apiBase):undefined;
export const apiMode=!!teaApi;
