import { Suspense } from 'react';
import { LoginForm } from './login-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Entrar · Casa do Celular' };

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Use o e-mail cadastrado pela sua franquia.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* useSearchParams (?redirect=) exige limite de Suspense na build estatica. */}
        <Suspense fallback={<div className="h-52 animate-pulse rounded-md bg-slate-100" />}>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
