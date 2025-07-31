"use client"

import { Button } from "@raypx/ui/components/button"
import { Card } from "@raypx/ui/components/card"
import { Textarea } from "@raypx/ui/components/textarea"
import { Code, Lightbulb, Rocket, Send, Sparkles } from "lucide-react"
import { useRef, useState } from "react"

const suggestedQuestions = [
  {
    icon: <Code className="h-4 w-4" />,
    text: "How do I deploy my Next.js app on Raypx?",
  },
  {
    icon: <Rocket className="h-4 w-4" />,
    text: "What are the benefits of using Raypx?",
  },
  {
    icon: <Lightbulb className="h-4 w-4" />,
    text: "Show me the pricing plans",
  },
]

export function MainChat() {
  const [inputValue, setInputValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return
    // TODO: Handle message sending
    console.log("Sending message:", inputValue)
    setInputValue("")

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)

    // Auto-resize textarea
    const textarea = e.target
    textarea.style.height = "auto"
    const newHeight = Math.min(textarea.scrollHeight, 200)
    textarea.style.height = `${newHeight}px`
  }

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion)
    textareaRef.current?.focus()
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-gradient-to-br from-background via-muted/5 to-background">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl space-y-8">
          {/* Header */}
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-primary/80 rounded-2xl flex items-center justify-center mb-6">
              <Sparkles className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">
              What can I help you with?
            </h1>
            <p className="text-xl text-muted-foreground max-w-lg mx-auto">
              I'm your Raypx AI assistant. Ask me anything about web
              development, our platform, or get started with building your next
              project.
            </p>
          </div>

          {/* Input Area */}
          <div className="space-y-4">
            <Card className="relative bg-background border-2 border-muted hover:border-primary/50 transition-colors">
              <div className="p-4">
                <Textarea
                  ref={textareaRef}
                  placeholder="Ask me anything about Raypx..."
                  value={inputValue}
                  onChange={handleTextareaChange}
                  onKeyPress={handleKeyPress}
                  className="min-h-[60px] max-h-[200px] resize-none border-0 bg-transparent placeholder:text-muted-foreground focus-visible:ring-0 text-base pr-12"
                  rows={1}
                />
                <Button
                  size="sm"
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim()}
                  className="absolute right-2 bottom-2 h-8 w-8 p-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </Card>

            <p className="text-xs text-muted-foreground text-center">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>

          {/* Suggested Questions */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground text-center">
              Try asking:
            </p>
            <div className="grid gap-2">
              {suggestedQuestions.map((suggestion, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="h-auto p-4 justify-start text-left bg-background/50 hover:bg-background border-muted hover:border-primary/50 transition-colors"
                  onClick={() => handleSuggestionClick(suggestion.text)}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mr-3 text-primary">
                    {suggestion.icon}
                  </div>
                  <span className="text-sm">{suggestion.text}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
