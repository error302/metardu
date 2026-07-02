import Image from 'next/image'

export default function RootLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A]">
      <div className="flex flex-col items-center gap-4">
        <Image
          src="/metardu-icon.png"
          alt="METARDU"
          width={64}
          height={64}
          className="rounded-lg animate-pulse"
          priority
        />
        <div className="text-white/40 text-sm font-mono tracking-wider animate-pulse">
          METARDU
        </div>
      </div>
    </div>
  )
}
