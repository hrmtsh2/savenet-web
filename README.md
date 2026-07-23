# SaveNet

[SaveNet](https://savenet.am1.tech) is an AI-powered, searchable library for posts and links a user saves across social media (Instagram and X for now), browser bookmarks, and reading list items. This app stores and enriches the posts collected from the [accompanying extension](https://chromewebstore.google.com/detail/savenet-save-smarter-find/kmbfnbpogmgfmlohnajkpmeicocpedof), then lets the user browse and ask questions about them.

## SaveNet Web

This repository `savenet-web` contains the Next.js app and its server-side capture, search, chat, and authentication functionality. The companion Chrome extension captures Instagram saves, X bookmarks, browser bookmarks, and Reading List items. The extension lives in the [`savenet-extension`](https://www.github.com/hrmtsh2/savenet-extension) repo.

- accepts authenticated captures from the extension
- stores posts in Aurora PostgreSQL with pgvector embeddings
- adds source and collection labels to saved posts
- enriches captures with OCR, URL extraction, entity resolution, and grounded web results where relevant
- provides a paginated library, labels view, and cited chat answers
- authenticates the web app through Amazon Cognito and NextAuth

## Stack

- Next.js 16, React 19, TypeScript, Tailwind CSS, and Base UI
- Amazon Cognito with NextAuth
- Aurora PostgreSQL, pgvector, and AWS RDS IAM authentication through Vercel OIDC
- Vercel AI SDK, Google Gemini, and Vercel AI Gateway

## Project structure

```text
app/
  api/                 capture and chat routes for the extension
  actions.ts           session-authenticated server actions
  library/             paginated library of saved posts
  chat/                cited chat interface
  categories/          label management
components/            application and Base UI components
lib/
  ai.ts                Gemini calls and AI utilities
  auth.ts              NextAuth and extension authentication helpers
  chat.ts              retrieval and chat orchestration
  db.ts                Aurora connection pool and RDS IAM signing
  queries.ts           database queries
scripts/               manually applied SQL migrations
```