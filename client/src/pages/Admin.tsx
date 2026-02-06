import React from 'react';
import { AdminConfigPanel } from '@/components/AdminConfigPanel';

export default function AdminPage() {
  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
      <div className="grid gap-6">
        <AdminConfigPanel />
      </div>
    </div>
  );
}