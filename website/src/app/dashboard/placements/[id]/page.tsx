import { notFound } from 'next/navigation';
import React from 'react';
import PlacementDetailClient from './PlacementDetailClient';

// Server component wrapper to validate the ID early
export default function PlacementDetailPage({ params }: { params: { id?: string } }) {
  const id = (params?.id || '').toString();
  if (!id || id.length > 128) {
    return notFound();
  }
  return <PlacementDetailClient id={id} />;
}
