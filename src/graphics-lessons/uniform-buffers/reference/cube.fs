#version 420 core
out vec4 FragColor;

layout (std140, binding = 1) uniform Color {
    vec4 color;
};

void main()
{
    FragColor = color;
}