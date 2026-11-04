import devAccounts from '../../../../supabase/dev-accounts.json';
import { useState } from 'react';
import { DEV_SIGN_IN_LABELS } from '../strings';
import { Button } from '../ui/Button';
import { signInWithPassword } from './session';

export default function DevSignIn() {
  const [isOpen, setIsOpen] = useState(false);
  const [didFail, setDidFail] = useState(false);

  async function signInAs(email: string) {
    setDidFail(!(await signInWithPassword(email, devAccounts.password)));
  }

  return (
    <div className="absolute bottom-1 left-page-side flex flex-col items-start">
      {isOpen && (
        <section className="flex flex-col items-start border border-line bg-paper px-3 py-1">
          {devAccounts.accounts.map(({ email }) => (
            <Button key={email} variant="quiet" onClick={() => void signInAs(email)}>{email}</Button>
          ))}
          {didFail && <p role="alert" className="max-w-60 pb-2 text-fine text-ink-2">{DEV_SIGN_IN_LABELS.failed}</p>}
        </section>
      )}
      <Button variant="quiet" aria-expanded={isOpen} onClick={() => setIsOpen(!isOpen)}>{DEV_SIGN_IN_LABELS.title}</Button>
    </div>
  );
}
