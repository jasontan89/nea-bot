# NEA Telegram Bot

A Telegram bot that provides real-time meteorological data for Singapore from the National Environment Agency (NEA).

## Features
- **Haze & PSI Tracking**: Real-time PSI index and haze forecast.
- **Weather Forecasts**: 2-hour and 24-hour weather forecasts.
- **Alerts**: Push notifications for heavy rain warnings and unhealthy PSI levels.
- **Web Dashboard**: An integrated Telegram Web App for viewing charts and details.
- **Other Info**: UV Index and Dengue Clusters.

## Architecture
- **Framework**: [grammY](https://grammy.dev/)
- **Hosting**: Supabase Edge Functions (Deno)
- **Database**: Supabase PostgreSQL (for user subscriptions)
- **Scheduling**: Supabase pg_cron

## Commands
- `/start` - Main menu
- `/psi` - Get current PSI and Haze
- `/forecast` - Get weather forecasts
- `/weather` - Real-time warnings
- `/alerts` - Manage subscription alerts
- `/dashboard` - Open the visual Web App dashboard
