import { notFound } from 'next/navigation';
import React from 'react';
import AppDetailClient from './AppDetailClient';

// Server wrapper validates the ID early and keeps RSC boundaries clean
export default function AppDetailPage({ params }: { params: { id?: string } }) {
  const id = (params?.id || '').toString();
  if (!id || id.length > 128) return notFound();
  return <AppDetailClient id={id} />;
}

// Client UI moved to ./AppDetailClient to keep this file server-only
