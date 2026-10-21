# Lekki geoportal

Niezależna, lekka aplikacja mapowa dla osób, które chcą szybko sprawdzić działkę: granice, numer, przeznaczenie w planie, ceny w okolicy, ortofotomapę aktualną i archiwalną. Interfejs w stylu map konsumenckich, dane na żywo z usług GUGiK (geoportal.gov.pl).

Status: koncepcja.

## Stack (planowany)

OpenLayers 10, Vite, React 19, TypeScript, Tailwind CSS, PWA. Hosting statyczny (Cloudflare Pages), opcjonalny Worker jako proxy dla usług bez CORS.

## Dane

Wszystkie dane pochodzą z usług sieciowych Głównego Urzędu Geodezji i Kartografii i są pobierane na żywo. Aplikacja nie kopiuje ani nie przechowuje danych GUGiK. Źródło: geoportal.gov.pl.
