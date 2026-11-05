import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function AppIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/seller/dashboard');
  }, []);
  return null;
}