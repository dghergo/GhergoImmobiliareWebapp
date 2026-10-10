// Video "Come presentare la proposta d'acquisto": uguale per tutti gli Open House.
export const VIDEO_PROPOSTA = '/video/proposta.mp4'
export const VIDEO_PROPOSTA_POSTER = '/video/proposta-poster.jpg'

export default function VideoProposta({ className = '' }: { className?: string }) {
  return (
    <video
      className={`w-full rounded-2xl shadow ${className}`}
      src={VIDEO_PROPOSTA}
      poster={VIDEO_PROPOSTA_POSTER}
      controls
      playsInline
      preload="none"
    />
  )
}
