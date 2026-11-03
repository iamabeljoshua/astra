import devAccounts from '../../../../supabase/dev-accounts.json';
import { useState } from 'react';
import { DEV_SIGN_IN_LABELS } from '../strings';
import { signInWithPassword } from './session';

export default function DevSignIn() {
  const [didFail, setDidFail] = useState(false);

  async function signInAs(email: string) {
    setDidFail(!(await signInWithPassword(email, devAccounts.password)));
  }

  return (
    <section className="flex max-w-90 flex-col gap-2 border border-line p-3">
      <h2 className="label text-ink-2">{DEV_SIGN_IN_LABELS.title}</h2>
      {devAccounts.accounts.map(({ email }) => (
        <button key={email} type="button" className="button button-outline" onClick={() => void signInAs(email)}>
          {email}
        </button>
      ))}
      {didFail && <p role="alert" className="text-fine text-ink-2">{DEV_SIGN_IN_LABELS.failed}</p>}
    </section>
  );
}
