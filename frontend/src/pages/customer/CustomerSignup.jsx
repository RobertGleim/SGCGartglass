import CustomerSignupForm from '../../components/forms/CustomerSignupForm'
import useCustomerAuth from '../../hooks/useCustomerAuth'

export default function CustomerSignup() {
  const { signup } = useCustomerAuth()
  return <CustomerSignupForm onSignup={signup} />
}
