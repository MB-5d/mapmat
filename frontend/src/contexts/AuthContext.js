import { createContext, useContext } from 'react';

const AuthContext = createContext({
  isLoggedIn: false,
  currentUser: null,
  onLogin: () => {},
  onLogout: () => {},
  onShowProfile: () => {},
  onShowSettings: () => {},
});

export const AuthProvider = AuthContext.Provider;

export const useAuth = () => useContext(AuthContext);
