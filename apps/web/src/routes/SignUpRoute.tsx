import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { RegisterRequest } from '@ui-builder/schema';
import { register } from '../api/auth.js';
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

export function SignUpRoute() {
  const { signedIn } = useAuth();
  const navigate = useNavigate();

  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const parsed = RegisterRequest.safeParse({
      name: form.get('name'),
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
      signedIn(await register(parsed.data));
      // New accounts have no workspace yet; the index route is what knows to offer
      // creating the first one.
      void navigate('/', { replace: true });
    } catch (error) {
      setFieldErrors(serverFieldErrors(error));
      setFormError(formErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout
      title="Create an account"
      subtitle="One account, as many workspaces as you need."
      footer={
        <>
          Already have one?{' '}
          <Link className={styles.link} to="/login">
            Sign in
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

        <Field label="Name" name="name" autoComplete="name" autoFocus error={fieldErrors.name} />

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          error={fieldErrors.email}
        />

        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          error={fieldErrors.password}
        />

        <Button type="submit" variant="primary" size="lg" block pending={pending}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
