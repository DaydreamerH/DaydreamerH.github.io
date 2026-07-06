add_executable(20_cubemaps skybox.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(20_cubemaps glfw opengl32)
endif()

foreach(FILE_NAME cube.vs cube.fs skybox.vs skybox.fs)
    add_custom_command(TARGET 20_cubemaps POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:20_cubemaps>/${FILE_NAME}"
    )
endforeach()

add_custom_command(TARGET 20_cubemaps POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory
    "$<TARGET_FILE_DIR:20_cubemaps>/skybox"
)

foreach(FILE_NAME right.jpg left.jpg top.jpg bottom.jpg front.jpg back.jpg)
    add_custom_command(TARGET 20_cubemaps POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_SOURCE_DIR}/images/skybox/${FILE_NAME}"
        "$<TARGET_FILE_DIR:20_cubemaps>/skybox/${FILE_NAME}"
    )
endforeach()
