import { createContext } from 'react'

export const AuthContext = createContext({
  authToken: '',
  login: async () => {},
  logout: () => {},
})
