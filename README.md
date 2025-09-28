# Textuno Template One

Launch your AI transcription SaaS in hours.

![preview](preview.png)

## Quick Start

1. Clone the repository

```bash
git clone https://github.com/textunoai/textuno-template-one.git
```

2. Install dependencies

```bash
pnpm install
```

3. Run the development server

```bash
pnpm dev
```

## Customize

- Set your environment variables

```bash
cp .env.example .env.development
```

- Set your theme in `src/app/theme.css`

[tweakcn](https://tweakcn.com/editor/theme)

- Set your landing page content in `src/i18n/pages/landing`

- Set your i18n messages in `src/i18n/messages`

## Deploy

- Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftextunoai%2Ftextuno-template-one&project-name=my-textuno-project&repository-name=my-textuno-project&redirect-url=https%3A%2F%2Ftextuno.io&demo-title=Textuno&demo-description=Launch%20your%20AI%20transcription%20startup%20in%20hours%2C%20not%20days&demo-url=https%3A%2F%2Ftextuno.io&demo-image=https%3A%2F%2Fpbs.twimg.com%2Fmedia%2FGgGSW3La8AAGJgU%3Fformat%3Djpg%26name%3Dlarge)

- Deploy to Cloudflare

for new project, clone with branch "cloudflare"

```shell
git clone -b cloudflare https://github.com/textunoai/textuno-template-one.git
```

for exist project, checkout to branch "cloudflare"

```shell
git checkout cloudflare
```

1. Customize your environment variables

```bash
cp .env.example .env.production
cp wrangler.toml.example wrangler.toml
```

edit your environment variables in `.env.production`

and put all the environment variables under `[vars]` in `wrangler.toml`

2. Deploy

```bash
npm run cf:deploy
```

## Community

- [Textuno](https://textuno.io)
- [Documentation](https://docs.textuno.io)

## License

- [Textuno AI SaaS Boilerplate License Agreement](LICENSE)
