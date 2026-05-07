interface Props {
  size?: 'sm' | 'md' | 'lg'
}

export default function Logo({ size = 'md' }: Props) {
  const sizes = { sm: 'text-xl', md: 'text-2xl', lg: 'text-4xl' }
  return (
    <span className={`font-black tracking-tight ${sizes[size]} select-none`}>
      <span style={{ color: '#ffffff' }}>e</span>
      <span style={{ color: '#F5A623' }}>›</span>
      <span style={{ color: '#ffffff' }}>pansão</span>
    </span>
  )
}
