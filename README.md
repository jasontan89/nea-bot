# NEA Telegram Bot

A Telegram bot that provides real-time meteorological data for Singapore from the National Environment Agency (NEA).

## Features
- **Air Quality & Haze (1-Hour PM2.5)**: Real-time 1-hour PM2.5 readings categorized into official NEA 4-Bands (Band 1 Normal to Band 4 Very High).
- **Weather Forecasts**: 2-hour and 24-hour weather forecasts.
- **Alerts**: Push notifications for heavy rain warnings and Elevated 1-hour PM2.5 levels (Band 2+).
- **Web Dashboard**: An integrated Telegram Web App for viewing charts and details.
- **Other Info**: UV Index and Dengue Clusters.

## Architecture
- **Framework**: [grammY](https://grammy.dev/)
- **Hosting**: Supabase Edge Functions (Deno)
- **Database**: Supabase PostgreSQL (for user subscriptions)
- **Scheduling**: Supabase pg_cron

## Commands
- `/start` - Main menu
- `/psi` - Get current 1-hour PM2.5 and NEA Bands
- `/forecast` - Get weather forecasts
- `/weather` - Real-time warnings
- `/alerts` - Manage subscription alerts
- `/dashboard` - Open the visual Web App dashboard
