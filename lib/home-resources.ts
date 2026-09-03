export const CANOPY_WIKI_URL =
  "https://hub2.canopymortgage.com/wiki/canopy-wiki"
export const LEGACY_TRAINING_WIKI_URL =
  "https://sites.google.com/canopymortgage.com/trainingwiki/home?authuser=0"

export function getHelpfulResourceLinks(canAccessBeta1: boolean) {
  return [
    {
      label: "Canopy Wiki",
      description: "Training, process guides, and team reference material.",
      href: canAccessBeta1 ? CANOPY_WIKI_URL : LEGACY_TRAINING_WIKI_URL,
      external: !canAccessBeta1,
      image: "/training-wiki.jpg",
    },
    {
      label: "Department Directory",
      description: "Find the right group when you need help.",
      href: "/department-directory",
      external: false,
      image: "/department-directory.png",
    },
    {
      label: "Compliment Your Team",
      description: "Send recognition when someone makes the work easier.",
      href: "https://docs.google.com/forms/d/e/1FAIpQLSd8FR2h37lG3e64t9_qNIoAn6qkUQaiycSyTzrGQO4unHaceA/viewform",
      external: true,
      image: "/compliment-employee.jpg",
    },
  ]
}
