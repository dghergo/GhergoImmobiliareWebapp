import type { MetadataRoute } from 'next'

// Icona e nome quando il programma viene aggiunto alla schermata Home del telefono
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ghergo Immobiliare - Open House',
    short_name: 'Ghergo OH',
    start_url: '/dashboard/login',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#203162',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
