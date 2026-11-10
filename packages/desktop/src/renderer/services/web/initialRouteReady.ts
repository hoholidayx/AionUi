import { createContext } from 'react';

// Non-Web callers and standalone sidebar tests have no Web startup gate.
export const InitialWebRouteReady = createContext(true);
