import { ColorContribution } from "@theia/core/lib/browser/color-application-contribution";
import { ColorRegistry } from "@theia/core/lib/browser/color-registry";
import { injectable } from "@theia/core/shared/inversify";

@injectable()
export class ScColorContribution implements ColorContribution {
    registerColors(colors: ColorRegistry): void {
        colors.register(
            {
                id: "sc.statusRunning",
                defaults: { dark: "charts.green", light: "charts.green" },
                description: "Running indicator",
            },
            {
                id: "sc.statusBooting",
                defaults: { dark: "charts.yellow", light: "charts.yellow" },
                description: "Booting indicator",
            },
            {
                id: "sc.statusStopped",
                defaults: { dark: "charts.red", light: "charts.red" },
                description: "Stopped indicator",
            },
            {
                id: "sc.statusUnresponsive",
                defaults: { dark: "charts.orange", light: "charts.orange" },
                description: "Unresponsive indicator",
            },
        );
    }
}
