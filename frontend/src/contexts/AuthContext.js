import { createContext, useContext } from 'react';

const AuthContext = createContext({
  authLoading: true,
  isLoggedIn: false,
  currentUser: null,
  onLogin: () => {},
  onSignup: () => {},
  onLogout: () => {},
  onShowProfile: () => {},
  onShowBilling: () => {},
  onShowSettings: () => {},
  onShowSupport: () => {},
});

export const AuthProvider = AuthContext.Provider;

export const useAuth = () => useContext(AuthContext);
