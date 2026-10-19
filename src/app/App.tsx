import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { AppProviders } from './providers';
import { createRouter } from './router';

export function App() {
  const [router] = useState(createRouter);
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
