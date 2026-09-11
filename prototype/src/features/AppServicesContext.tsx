import { createContext, useContext } from 'react';
import type { AppServices } from '../api/createServices';

export const AppServicesContext = createContext<AppServices | null>(null);
export const useAppServices = () => {
  const services = useContext(AppServicesContext);
  if (!services) throw new Error('AppServicesProvider 缺失');
  return services;
};
