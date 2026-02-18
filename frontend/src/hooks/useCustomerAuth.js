import { useContext } from 'react'
import { CustomerAuthContext } from '../contexts/CustomerAuthContext'

export default function useCustomerAuth() {
  return useContext(CustomerAuthContext)
}
