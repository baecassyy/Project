"use client";

// Replace data-ad-client and data-ad-slot with your real AdSense values
export default function AdBanner({ slot }: { slot: string }) {
  return (
    <div className="w-full bg-gray-100 border border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 text-sm py-6 my-4">
      <span>Ad · slot: {slot} · Replace with Google AdSense code</span>
    </div>
  );
}
