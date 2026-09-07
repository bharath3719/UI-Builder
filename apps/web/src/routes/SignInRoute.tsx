import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { LoginRequest } from '@ui-builder/schema';
import { login } from '../api/auth.js';
import { useAuth } from '../auth/context.js';
import { Button } from '../ui/Button.js';
import { Field } from '../ui/Field.js';
import {
  type FieldErrors,
  formErrorMessage,
  serverFieldErrors,
  zodFieldErrors,
} from '../lib/formErrors.js';
import { AuthLayout } from './AuthLayout.js';
import styles from './AuthLayout.module.css';

export function SignInRoute() {
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();

  // Where the guard bounced them from, so signing in resumes what they were doing
  // instead of dropping them on the workspace index.
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const parsed = LoginRequest.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });

    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      setFormError(undefined);
      return;
    }

    setPending(true);
    setFieldErrors({});
    setFormError(undefined);

    try {
      signedIn(await login(parsed.data));
      void navigate(from, { replace: true });
    } catch (error) {
      setFieldErrors(serverFieldErrors(error));
      setFormError(formErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Pick up where you left off."
      footer={
        <>
          No account yet?{' '}
          <Link className={styles.link} to="/signup">
            Create one
          </Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {formError && (
          <p className={styles.error} role="alert">
            {formError}
          </p>
        )}

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          error={fieldErrors.email}
        />

        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          error={fieldErrors.password}
        />

        <Button type="submit" variant="primary" size="lg" block pending={pending}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
