import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';

interface GoogleSignInButtonProps {
  onSuccess: (credential: string) => void | Promise<void>;
  onError?: (message: string) => void;
  disabled?: boolean;
  /** Pre-select the invited Gmail account when possible */
  loginHint?: string;
}

export function GoogleSignInButton({
  onSuccess,
  onError,
  disabled,
  loginHint,
}: GoogleSignInButtonProps) {
  const handleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      onError?.('Google sign-in did not return a credential');
      return;
    }
    await onSuccess(response.credential);
  };

  return (
    <div className={disabled ? 'pointer-events-none opacity-50' : ''}>
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={() => onError?.('Google sign-in was cancelled or failed')}
        useOneTap={false}
        theme="outline"
        size="large"
        width={360}
        text="continue_with"
        shape="rectangular"
        login_hint={loginHint}
      />
    </div>
  );
}
