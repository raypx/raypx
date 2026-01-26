interface RoundedButtonProps {
  onClick: () => void;
  title: string;
}

export const RoundedButton: React.FC<RoundedButtonProps> = ({ onClick, title }) => {
  return (
    <button
      className="flex h-10 cursor-pointer items-center justify-center rounded-full border border-transparent bg-linear-to-r from-teal-500 to-cyan-500 px-4 text-neutral-800 text-sm transition-colors hover:border-green-200 hover:text-neutral-900 sm:h-12 sm:min-w-44 sm:px-5 sm:text-base"
      onClick={onClick}
      type="button"
    >
      {title}
    </button>
  );
};
