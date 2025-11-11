import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import {
  Bot,
  Database,
  Globe,
  LineChart,
  Lock,
  type LucideIcon,
  Palette,
  Rocket,
  Zap,
} from "lucide-react";
import Container from "@/components/layout/container";

type Feature = {
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string;
};

const features: Feature[] = [
  {
    icon: Bot,
    titleKey: "features.aiFirst.title",
    descriptionKey: "features.aiFirst.description",
  },
  {
    icon: Zap,
    titleKey: "features.fast.title",
    descriptionKey: "features.fast.description",
  },
  {
    icon: Lock,
    titleKey: "features.security.title",
    descriptionKey: "features.security.description",
  },
  {
    icon: Palette,
    titleKey: "features.ui.title",
    descriptionKey: "features.ui.description",
  },
  {
    icon: LineChart,
    titleKey: "features.analytics.title",
    descriptionKey: "features.analytics.description",
  },
  {
    icon: Database,
    titleKey: "features.database.title",
    descriptionKey: "features.database.description",
  },
  {
    icon: Globe,
    titleKey: "features.i18n.title",
    descriptionKey: "features.i18n.description",
  },
  {
    icon: Rocket,
    titleKey: "features.deploy.title",
    descriptionKey: "features.deploy.description",
  },
];

export function FeaturesSection() {
  return (
    <section className="py-20 md:py-32 bg-muted/30">
      <Container>
        <div className="space-y-12">
          {/* Section header */}
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">Features</h2>
            <p className="text-lg text-muted-foreground">Features</p>
          </div>

          {/* Features grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card
                  className="group relative border-2 transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:-translate-y-1"
                  key={index}
                >
                  <CardHeader>
                    <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                      <Icon className="size-6 text-primary" />
                    </div>
                    <CardTitle className="text-xl">{feature.titleKey}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {feature.descriptionKey}
                    </CardDescription>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
