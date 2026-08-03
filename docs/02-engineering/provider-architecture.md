# Provider Architecture

## Principle

Pebl is AI-agnostic.

## Analysis options

- Pebl managed cloud
- user-provided OpenAI API key
- user-provided Anthropic API key
- Gemini API
- OpenRouter
- LiteLLM
- Ollama
- LM Studio
- enterprise OpenAI-compatible endpoint

## Subscription plans

Consumer subscriptions such as Claude Max or ChatGPT Pro must only be supported when the provider exposes an authorized, documented integration path.

Pebl must not imitate users, scrape private sessions, or bypass provider billing terms.

## Interface

Each analysis provider implements:

- capability discovery;
- structured generation;
- token accounting;
- timeout handling;
- privacy declaration;
- model selection;
- health check.

## Cost control

- deterministic analysis first;
- batch post-task analysis;
- cache reusable classifications;
- use smaller models for extraction;
- reserve premium models for ambiguous causal analysis.
